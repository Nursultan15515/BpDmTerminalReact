using System.Data.Common;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.ServiceModel;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;
using TerminalApi.Services.Terminal;

namespace TerminalApi.Controllers;

// Страница диагностики (?diag): с какими настройками работает приложение, тест подключения к БД, поиск через SOAP.
// Пароли из настроек и тест с другими значениями — только с самого сервера (браузер в RDP-сеансе); поиск — с сервера
// и с терминалов из TerminalInfo, как в самом киоске. В журналы БД (SearchRequestInfo и др.) диагностика не пишет.
[ApiController]
[Route("api/diag")]
public class DiagController : ControllerBase
{
    private const string PasswordPlaceholder = "CHANGE-ME";
    private const int MaxSearchValueLength = 30; // как в VisitorsController
    private const int ConnectTimeoutSeconds = 5;
    private const int OpenDeadlineSeconds = 10;
    private const int TcpProbeSeconds = 3;

    private const string NetworkHint =
        "Сервер не найден или недоступен с сервера приложения: проверьте адрес (data source в Web.config старого сайта), порт и брандмауэр.";

    private readonly IConfiguration _config;
    private readonly IWebHostEnvironment _env;
    private readonly TerminalSoapOptions _soapOptions;
    private readonly ITerminalSoapClient _soap;
    private readonly ITerminalResolver _resolver;
    private readonly ILogger<DiagController> _logger;

    public DiagController(
        IConfiguration config,
        IWebHostEnvironment env,
        IOptions<TerminalSoapOptions> soapOptions,
        ITerminalSoapClient soap,
        ITerminalResolver resolver,
        ILogger<DiagController> logger)
    {
        _config = config;
        _env = env;
        _soapOptions = soapOptions.Value;
        _soap = soap;
        _resolver = resolver;
        _logger = logger;
    }

    // Настройки, с которыми работает приложение. Пароли — только на самом сервере, остальным — их состояние.
    [HttpGet("settings")]
    public IActionResult Settings()
    {
        var local = IsLocalRequest();
        var db = ConfiguredConnection(out var dbError);
        var windowsAuth = db?.IntegratedSecurity == true;

        return Ok(new DiagSettings(
            _env.EnvironmentName,
            Environment.MachineName,
            HttpContext.GetClientIp(),
            local,
            ConfigFiles(),
            new DiagDbSettings(
                db?.DataSource,
                db?.InitialCatalog,
                windowsAuth ? null : db?.UserID,
                windowsAuth,
                local && !windowsAuth ? db?.Password : null,
                windowsAuth ? "windows" : SecretState(db?.Password),
                dbError),
            new DiagSoapSettings(
                _soapOptions.Endpoint,
                local ? _soapOptions.Password : null,
                SecretState(_soapOptions.Password),
                _soapOptions.UseStub)));
    }

    // Тест подключения: новое соединение со значениями формы поверх настроек (пустое поле — из настроек).
    // Сами настройки приложения не меняются.
    [HttpPost("db-test")]
    public async Task<IActionResult> DbTest([FromBody] DiagDbTestRequest req, CancellationToken ct)
    {
        var csb = ConfiguredConnection(out var configError);
        if (csb is null)
            return Ok(new DiagDbResult { Error = configError });

        // Другие значения — только с сервера: иначе через страницу можно было бы подбирать пароли SQL из сети.
        if (ApplyOverrides(csb, req) && !IsLocalRequest())
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Другие значения можно проверить только на самом сервере (через RDP)." });

        csb.ConnectTimeout = ConnectTimeoutSeconds;
        // Каждая проверка — новое соединение: пул после сбоя какое-то время отдаёт ту же ошибку, не пробуя снова.
        csb.Pooling = false;
        csb.ApplicationName = "TerminalApi diag";

        // Порт проверяется параллельно: при сбое сразу видно, сеть это (нет ответа, отказ) или уже SQL Server.
        var probe = ProbeTcpAsync(csb.DataSource, ct);
        // Своё ограничение по времени: после TCP клиент пробует именованные каналы, и эта попытка
        // к недоступному адресу длится ~30 с, не глядя на Connect Timeout.
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(OpenDeadlineSeconds));

        var sw = Stopwatch.StartNew();
        try
        {
            await using var connection = new SqlConnection(csb.ConnectionString);
            await connection.OpenAsync(deadline.Token);
            var connectMs = sw.ElapsedMilliseconds;

            var result = await ReadServerInfoAsync(connection, ct) with { Ok = true, ElapsedMs = connectMs };
            result = await ReadConnectionInfoAsync(connection, result, ct);
            result = await ReadTerminalsAsync(connection, result, ct);

            _logger.LogInformation("Diag DB test {Server}/{Database}: connected in {Ms} ms", csb.DataSource, csb.InitialCatalog, connectMs);
            return Ok(result);
        }
        catch (SqlException ex)
        {
            _logger.LogWarning("Diag DB test {Server}/{Database}: SQL error {Number} after {Ms} ms: {Message}",
                csb.DataSource, csb.InitialCatalog, ex.Number, sw.ElapsedMilliseconds, ex.Message);
            return Ok(new DiagDbResult
            {
                ElapsedMs = sw.ElapsedMilliseconds,
                Error = ex.Message,
                ErrorNumber = ex.Number,
                Hint = SqlHint(ex),
                TcpProbe = await probe,
            });
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning("Diag DB test {Server}/{Database}: no answer in {Seconds} s", csb.DataSource, csb.InitialCatalog, OpenDeadlineSeconds);
            return Ok(new DiagDbResult
            {
                ElapsedMs = sw.ElapsedMilliseconds,
                Error = $"Нет ответа за {OpenDeadlineSeconds} с.",
                Hint = NetworkHint,
                TcpProbe = await probe,
            });
        }
        catch (OperationCanceledException)
        {
            return new EmptyResult(); // страницу закрыли, не дождавшись
        }
        catch (Exception ex) when (ex is InvalidOperationException or ArgumentException)
        {
            return Ok(new DiagDbResult { ElapsedMs = sw.ElapsedMilliseconds, Error = ex.Message });
        }
    }

    // Простая проверка порта — только для «адрес» или «адрес,порт»: у именованного экземпляра порт неизвестен
    // (его сообщает служба SQL Browser), у LocalDB и локальных имён — свои протоколы.
    private static async Task<string?> ProbeTcpAsync(string dataSource, CancellationToken ct)
    {
        var target = dataSource.Trim();
        if (target.StartsWith("tcp:", StringComparison.OrdinalIgnoreCase))
            target = target[4..];
        else if (target.Contains(':'))
            return null; // np:, lpc:, admin: — не TCP
        if (target.StartsWith('(') || target.Contains('\\'))
            return null;

        var parts = target.Split(',');
        var host = parts[0].Trim();
        if (host is "" or ".")
            return null;
        var port = parts.Length > 1 && int.TryParse(parts[1].Trim(), out var p) ? p : 1433;
        var name = $"TCP {host}:{port}";

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(TcpProbeSeconds));
        using var tcp = new TcpClient();
        var sw = Stopwatch.StartNew();
        try
        {
            await tcp.ConnectAsync(host, port, timeout.Token);
            return $"{name}: порт открыт ({sw.ElapsedMilliseconds} мс) — сеть в порядке.";
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return $"{name}: нет ответа за {TcpProbeSeconds} с — адрес недоступен или порт закрыт брандмауэром.";
        }
        catch (SocketException ex)
        {
            return ex.SocketErrorCode switch
            {
                SocketError.ConnectionRefused => $"{name}: отказ — компьютер доступен, но на этом порту SQL Server не слушает.",
                SocketError.HostNotFound or SocketError.NoData => $"{name}: имя {host} не найдено (DNS).",
                _ => $"{name}: {ex.Message}",
            };
        }
        catch (Exception ex)
        {
            return $"{name}: {ex.Message}"; // проба не бросает: при удачном подключении её результата не ждут
        }
    }

    // Поиск посетителя тем же GetVisitor, что и киоск, но от имени указанного терминала.
    [HttpPost("search")]
    public async Task<IActionResult> Search([FromBody] DiagSearchRequest req, CancellationToken ct)
    {
        var terminalName = req.TerminalName?.Trim();
        var searchValue = req.SearchValue?.Trim();
        if (string.IsNullOrEmpty(terminalName))
            return BadRequest(new { error = "Укажите TerminalName." });
        if (string.IsNullOrEmpty(searchValue) || searchValue.Length > MaxSearchValueLength)
            return BadRequest(new { error = $"ИИН или номер документа — от 1 до {MaxSearchValueLength} символов." });

        if (!IsLocalRequest() && await RefuseSearchAsync(ct) is { } refusal)
            return refusal;

        var sw = Stopwatch.StartNew();
        try
        {
            var lookup = await _soap.GetVisitorAsync(searchValue, terminalName, ct);
            _logger.LogInformation("Diag search as {Terminal}: {Result} in {Ms} ms",
                terminalName, lookup.Found ? "found" : "not found", sw.ElapsedMilliseconds);
            return Ok(new DiagSearchResult
            {
                Ok = true,
                ElapsedMs = sw.ElapsedMilliseconds,
                Found = lookup.Found,
                Message = lookup.Message,
                Card = lookup.Card,
                Stub = _soapOptions.UseStub,
            });
        }
        catch (Exception ex) when (ex is CommunicationException or TimeoutException)
        {
            _logger.LogWarning(ex, "Diag search as {Terminal} failed after {Ms} ms", terminalName, sw.ElapsedMilliseconds);
            return Ok(new DiagSearchResult
            {
                ElapsedMs = sw.ElapsedMilliseconds,
                Stub = _soapOptions.UseStub,
                Error = Describe(ex),
                Hint = SoapHint(ex),
            });
        }
    }

    // Не с сервера — только с терминала из TerminalInfo: то же условие, что у поиска в киоске.
    private async Task<IActionResult?> RefuseSearchAsync(CancellationToken ct)
    {
        var ip = HttpContext.GetClientIp();
        string? terminal;
        try
        {
            terminal = await _resolver.ResolveTerminalNameAsync(ip, ct);
        }
        catch (Exception ex) when (ex is DbException or InvalidOperationException)
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                new { error = "База недоступна, поэтому не проверить, что это терминал. Поиск можно запустить на самом сервере (через RDP)." });
        }

        return terminal is null
            ? StatusCode(StatusCodes.Status403Forbidden,
                new { error = $"Поиск доступен на сервере и на терминалах из TerminalInfo, а IP {ip} в TerminalInfo нет." })
            : null;
    }

    // Запрос с самого сервера: localhost или собственный адрес сервера (браузер в RDP-сеансе).
    // Под IIS это адрес клиента без посредников; за обратным прокси на этой же машине локальными выглядели бы все.
    private bool IsLocalRequest()
    {
        var connection = HttpContext.Connection;
        if (connection.RemoteIpAddress is not { } remote)
            return false;

        remote = Unmap(remote);
        return IPAddress.IsLoopback(remote) || (connection.LocalIpAddress is { } local && remote.Equals(Unmap(local)));
    }

    private static IPAddress Unmap(IPAddress address) => address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address;

    private SqlConnectionStringBuilder? ConfiguredConnection(out string? error)
    {
        error = null;
        var cs = _config.GetConnectionString("Default");
        if (string.IsNullOrWhiteSpace(cs))
        {
            error = "ConnectionStrings:Default не задана.";
            return null;
        }

        try
        {
            return new SqlConnectionStringBuilder(cs);
        }
        catch (ArgumentException ex)
        {
            error = $"Строка подключения не разбирается: {ex.Message}";
            return null;
        }
    }

    // Значения формы поверх настроек; пустое поле — значение из настроек. True — если что-то отличается.
    private static bool ApplyOverrides(SqlConnectionStringBuilder csb, DiagDbTestRequest req)
    {
        var changed = false;
        if (Filled(req.Server) is { } server && !Same(server, csb.DataSource))
        {
            csb.DataSource = server;
            changed = true;
        }
        if (Filled(req.Database) is { } database && !Same(database, csb.InitialCatalog))
        {
            csb.InitialCatalog = database;
            changed = true;
        }
        if (Filled(req.User) is { } user && (csb.IntegratedSecurity || !Same(user, csb.UserID)))
        {
            csb.IntegratedSecurity = false;
            csb.UserID = user;
            changed = true;
        }
        // Пароль не обрезаем: пробелы в нём могут быть настоящими.
        if (!string.IsNullOrEmpty(req.Password) && req.Password != csb.Password)
        {
            csb.IntegratedSecurity = false;
            csb.Password = req.Password;
            changed = true;
        }
        return changed;
    }

    private static string? Filled(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool Same(string a, string? b) => string.Equals(a, b?.Trim(), StringComparison.OrdinalIgnoreCase);

    private static async Task<DiagDbResult> ReadServerInfoAsync(SqlConnection connection, CancellationToken ct)
    {
        await using var cmd = new SqlCommand(
            "SELECT @@SERVERNAME, DB_NAME(), SUSER_SNAME(), " +
            "CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128)), CAST(SERVERPROPERTY('Edition') AS nvarchar(128))",
            connection);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        await reader.ReadAsync(ct);
        return new DiagDbResult
        {
            ServerName = Text(reader, 0),
            Database = Text(reader, 1),
            Login = Text(reader, 2),
            Version = Text(reader, 3),
            Edition = Text(reader, 4),
        };
    }

    // Как именно подключились. Нужно право VIEW SERVER STATE (у sa есть); нет — без этих подробностей.
    private static async Task<DiagDbResult> ReadConnectionInfoAsync(SqlConnection connection, DiagDbResult result, CancellationToken ct)
    {
        try
        {
            await using var cmd = new SqlCommand(
                "SELECT net_transport, encrypt_option, local_net_address, local_tcp_port FROM sys.dm_exec_connections WHERE session_id = @@SPID",
                connection);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct))
                return result;

            var ip = Text(reader, 2);
            return result with
            {
                Transport = Text(reader, 0),
                Encrypted = string.Equals(Text(reader, 1), "TRUE", StringComparison.OrdinalIgnoreCase),
                ServerAddress = ip is null || reader.IsDBNull(3) ? ip : $"{ip}:{reader.GetInt32(3)}",
            };
        }
        catch (SqlException)
        {
            return result;
        }
    }

    // Список TerminalInfo: подсказки имён для поиска и проверка, зарегистрирован ли IP открывшего страницу.
    private async Task<DiagDbResult> ReadTerminalsAsync(SqlConnection connection, DiagDbResult result, CancellationToken ct)
    {
        var ip = HttpContext.GetClientIp();
        try
        {
            await using var cmd = new SqlCommand("SELECT TerminalName, IpAddress FROM TerminalInfo ORDER BY TerminalName", connection);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            var terminals = new List<DiagTerminal>();
            while (await reader.ReadAsync(ct))
                terminals.Add(new DiagTerminal(Text(reader, 0), Text(reader, 1)));

            // В SQL сравнение строк не видит хвостовых пробелов — здесь так же.
            var own = terminals.FirstOrDefault(t => string.Equals(t.Ip?.Trim(), ip, StringComparison.OrdinalIgnoreCase));
            return result with { Terminals = terminals, ClientIp = ip, ClientTerminal = own?.Name };
        }
        catch (SqlException ex)
        {
            return result with { ClientIp = ip, TerminalsError = ex.Message };
        }
    }

    private static string? Text(DbDataReader reader, int i) => reader.IsDBNull(i) ? null : reader.GetValue(i).ToString();

    // Подхваченные файлы настроек. Из отсутствующих показываем только appsettings.<режим>.json — его и создают
    // на сервере; прочие необязательные источники .NET (TerminalApi.settings.json и т.п.) не нужны.
    private IReadOnlyList<DiagConfigFile> ConfigFiles()
    {
        if (_config is not IConfigurationRoot root)
            return [];

        var environmentFile = $"appsettings.{_env.EnvironmentName}.json";
        return root.Providers.OfType<FileConfigurationProvider>()
            .Select(p => new DiagConfigFile(
                p.Source.Path ?? "?",
                p.Source.Path is { } path && p.Source.FileProvider?.GetFileInfo(path).Exists == true))
            .Where(f => f.Exists || f.Name.Equals(environmentFile, StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    private static string SecretState(string? value) =>
        string.IsNullOrEmpty(value) ? "empty" : value == PasswordPlaceholder ? "placeholder" : "set";

    private static string? SqlHint(SqlException ex)
    {
        if (ex.Message.Contains("pre-login handshake", StringComparison.OrdinalIgnoreCase)
            || ex.Message.Contains("SSL Provider", StringComparison.OrdinalIgnoreCase))
            return "Сервер найден, но не удалось договориться о шифровании: попробуйте Encrypt=False в строке подключения.";

        return ex.Number switch
        {
            18456 => "Неверный логин или пароль SQL.",
            18452 => "Сервер не принимает SQL-логины — только вход Windows.",
            4060 => "Нет такой базы или у логина нет к ней доступа.",
            -2 => $"Сервер не ответил за {ConnectTimeoutSeconds} с: адрес недоступен или сервер не отвечает.",
            // Сетевые: -1/26/40 — SqlClient, 2/53/64/67/121/258/1225/1231 — Windows, 100xx/110xx — сокеты.
            -1 or 2 or 26 or 40 or 53 or 64 or 67 or 121 or 258 or 1225 or 1231 or 10051 or 10060 or 10061 or 10065 or 11001 or 11004 => NetworkHint,
            _ => null,
        };
    }

    // Все исключения WCF ниже — CommunicationException, поэтому частные случаи идут раньше. Отказ порта приходит
    // как CommunicationException с SocketException внутри, адрес без ответа — как ServerTooBusyException (~1 мин).
    private static string? SoapHint(Exception ex) => ex switch
    {
        FaultException => "Сервис принял запрос, но вернул ошибку — текст выше.",
        ProtocolException => "Ответ не похож на SOAP — возможно, адрес ведёт не на TerminalService.asmx.",
        EndpointNotFoundException or ServerTooBusyException or TimeoutException => UnreachableSoapHint,
        CommunicationException when HasInner<SocketException>(ex) || HasInner<HttpRequestException>(ex) => UnreachableSoapHint,
        CommunicationException when ex.Message.Contains("empty", StringComparison.OrdinalIgnoreCase) => "Сервис вернул пустой ответ.",
        _ => null,
    };

    private const string UnreachableSoapHint =
        "Адрес SOAP недоступен или неверен: проверьте TerminalSoap:Endpoint (как в Web.config старого сайта) и сеть до него.";

    private static bool HasInner<T>(Exception ex) where T : Exception
    {
        for (var e = ex.InnerException; e is not null; e = e.InnerException)
            if (e is T)
                return true;
        return false;
    }

    private static string Describe(Exception ex)
    {
        var messages = new List<string>();
        for (var e = ex; e is not null; e = e.InnerException)
            if (!messages.Contains(e.Message))
                messages.Add(e.Message);
        return $"{ex.GetType().Name}: {string.Join(" → ", messages)}";
    }
}

public sealed record DiagSettings(
    string Environment,
    string Machine,
    string? ClientIp,
    bool Local,
    IReadOnlyList<DiagConfigFile> ConfigFiles,
    DiagDbSettings Db,
    DiagSoapSettings Soap);

public sealed record DiagConfigFile(string Name, bool Exists);

// PasswordState: set | placeholder (CHANGE-ME) | empty | windows (вход Windows, пароля нет).
public sealed record DiagDbSettings(
    string? Server,
    string? Database,
    string? User,
    bool WindowsAuth,
    string? Password,
    string PasswordState,
    string? Error);

public sealed record DiagSoapSettings(string Endpoint, string? Password, string PasswordState, bool UseStub);

public sealed record DiagDbTestRequest(string? Server, string? Database, string? User, string? Password);

public sealed record DiagSearchRequest(string? TerminalName, string? SearchValue);

public sealed record DiagTerminal(string? Name, string? Ip);

public sealed record DiagDbResult
{
    public bool Ok { get; init; }
    public long ElapsedMs { get; init; }
    public string? ServerName { get; init; }
    public string? Database { get; init; }
    public string? Login { get; init; }
    public string? Version { get; init; }
    public string? Edition { get; init; }
    public string? Transport { get; init; }
    public bool? Encrypted { get; init; }
    public string? ServerAddress { get; init; }
    public IReadOnlyList<DiagTerminal>? Terminals { get; init; }
    public string? TerminalsError { get; init; }
    public string? ClientIp { get; init; }
    public string? ClientTerminal { get; init; }
    public string? Error { get; init; }
    public int? ErrorNumber { get; init; }
    public string? Hint { get; init; }
    public string? TcpProbe { get; init; }
}

public sealed record DiagSearchResult
{
    public bool Ok { get; init; }
    public long ElapsedMs { get; init; }
    public bool Found { get; init; }
    public string? Message { get; init; }
    public VisitorCard? Card { get; init; }
    public bool Stub { get; init; }
    public string? Error { get; init; }
    public string? Hint { get; init; }
}

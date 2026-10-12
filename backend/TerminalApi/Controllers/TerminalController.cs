using System.ServiceModel;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using TerminalApi.Services.Logging;
using TerminalApi.Services.Terminal;

namespace TerminalApi.Controllers;

// Отчёты киоска, не привязанные к посетителю. С диспенсером (localhost:8080 на терминале) браузер
// работает сам, как в легаси: бэкенд может стоять не на терминале и до его localhost не достанет.
[ApiController]
[Route("api/terminal")]
public class TerminalController : ControllerBase
{
    private const int MaxDescriptionLength = 4000;
    private const int MaxNoticeLength = 1000;

    private readonly ITerminalSoapClient _soap;
    private readonly ITerminalResolver _resolver;
    private readonly ITerminalLogService _log;
    private readonly TerminalOptions _options;
    private readonly ILogger<TerminalController> _logger;

    public TerminalController(
        ITerminalSoapClient soap,
        ITerminalResolver resolver,
        ITerminalLogService log,
        IOptions<TerminalOptions> options,
        ILogger<TerminalController> logger)
    {
        _soap = soap;
        _resolver = resolver;
        _log = log;
        _options = options.Value;
        _logger = logger;
    }

    // Статус диспенсера, полученный киоском (легаси: Index.cshtml → SendCardEndInformation).
    // CardsEnded уходит при status 0 (карт нет) и 1 (заканчиваются); у терминалов
    // с «неправильным счётчиком» вместо 1 это status 2.
    [HttpPost("card-status")]
    public async Task<IActionResult> CardStatus([FromBody] CardStatusReport req, CancellationToken ct)
    {
        if (req?.Status is not { } status)
            return BadRequest("status is required");

        var ip = HttpContext.GetClientIp();
        var wrongCounter = ip is not null && _options.WrongCardCounterIps.Contains(ip);
        var cardsEnding = status switch
        {
            0 => true,
            1 => !wrongCounter,
            2 => wrongCounter,
            _ => false,
        };
        if (!cardsEnding)
            return Ok();

        var terminalName = await _resolver.ResolveTerminalNameAsync(ip, ct);
        if (string.IsNullOrEmpty(terminalName))
        {
            await _log.AddErrorAsync("terminalName is null or empty", ip, "SendCardEndInformation", ct);
            return Ok();
        }

        try
        {
            await _soap.CardsEndedAsync(terminalName, ct);
            _logger.LogInformation("CardsEnded sent for {Terminal} (card status {Status})", terminalName, status);
        }
        catch (Exception ex) when (ex is CommunicationException or TimeoutException)
        {
            // Легаси проглатывает ошибку и всё равно отвечает Ok.
            await _log.AddErrorAsync(ex.ToString(), ip, "SendCardEndInformation", ct);
        }

        return Ok();
    }

    // Ошибки на стороне киоска — диспенсер, камера (легаси: ErrorPage?errorMessage=… → TerminalError).
    [HttpPost("errors")]
    [RequestSizeLimit(64 * 1024)]
    public async Task<IActionResult> ReportError([FromBody] ClientErrorReport req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Description))
            return BadRequest("description is required");

        await _log.AddErrorAsync(
            Truncate(req.Description, MaxDescriptionLength),
            HttpContext.GetClientIp(),
            Truncate(req.Notice, MaxNoticeLength),
            ct);
        return Ok();
    }

    private static string? Truncate(string? value, int maxLength) =>
        value is not null && value.Length > maxLength ? value[..maxLength] : value;
}

// Status nullable: без поля в JSON int стал бы 0 и ложно означал бы «карт нет».
public sealed record CardStatusReport(int? Status);

public sealed record ClientErrorReport(string Description, string? Notice);

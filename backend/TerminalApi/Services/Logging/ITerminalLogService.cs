namespace TerminalApi.Services.Logging;

// Порт LogHelper: запись в таблицы SearchRequestInfo / PassCardVisitorInfoLog / TerminalError.
public interface ITerminalLogService
{
    Task AddSearchRequestInfoAsync(string? searchValue, string? ip, CancellationToken ct = default);

    Task AddPassCardVisitorInfoLogAsync(string? passCardVisitorId, string? rfidNumber, string? notice, CancellationToken ct = default);

    Task AddErrorAsync(string? description, string? ip, string? notice = null, CancellationToken ct = default);
}

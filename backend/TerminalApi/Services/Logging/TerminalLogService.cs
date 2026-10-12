using TerminalApi.Data;
using TerminalApi.Data.Entities;

namespace TerminalApi.Services.Logging;

public sealed class TerminalLogService : ITerminalLogService
{
    private readonly TerminalEntities _db;
    private readonly ILogger<TerminalLogService> _logger;

    public TerminalLogService(TerminalEntities db, ILogger<TerminalLogService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public Task AddSearchRequestInfoAsync(string? searchValue, string? ip, CancellationToken ct = default) =>
        SaveAsync(() => _db.SearchRequestInfos.Add(new SearchRequestInfo
        {
            CreatedDateTime = DateTime.Now,
            IpAddress = ip,
            SearchValue = searchValue,
        }), ct);

    public Task AddPassCardVisitorInfoLogAsync(string? passCardVisitorId, string? rfidNumber, string? notice, CancellationToken ct = default) =>
        SaveAsync(() => _db.PassCardVisitorInfoLogs.Add(new PassCardVisitorInfoLog
        {
            CreatedDateTime = DateTime.Now,
            PassCardVisitorId = passCardVisitorId,
            RfidNumber = rfidNumber,
            Notice = notice,
        }), ct);

    public Task AddErrorAsync(string? description, string? ip, string? notice = null, CancellationToken ct = default) =>
        SaveAsync(() => _db.TerminalErrors.Add(new TerminalError
        {
            CreatedDate = DateTime.Now,
            Description = description,
            IdAddress = ip,
            Notice = notice,
        }), ct);

    // Best-effort: провал записи лога не должен ронять основной поток (как try/catch в легаси LogHelper.AddError).
    private async Task SaveAsync(Action add, CancellationToken ct)
    {
        try
        {
            add();
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write terminal log entry");
        }
    }
}

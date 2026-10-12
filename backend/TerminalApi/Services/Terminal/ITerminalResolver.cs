using Microsoft.EntityFrameworkCore;
using TerminalApi.Data;

namespace TerminalApi.Services.Terminal;

// Имя терминала (= логин в SOAP) определяется по IP из таблицы TerminalInfo.
public interface ITerminalResolver
{
    Task<string?> ResolveTerminalNameAsync(string? ip, CancellationToken ct = default);
}

public sealed class TerminalResolver : ITerminalResolver
{
    private readonly TerminalEntities _db;

    public TerminalResolver(TerminalEntities db)
    {
        _db = db;
    }

    public async Task<string?> ResolveTerminalNameAsync(string? ip, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(ip))
            return null;

        return await _db.TerminalInfos
            .Where(t => t.IpAddress == ip)
            .Select(t => t.TerminalName)
            .FirstOrDefaultAsync(ct);
    }
}

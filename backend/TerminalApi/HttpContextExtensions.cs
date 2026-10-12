namespace TerminalApi;

public static class HttpContextExtensions
{
    // IP киоска (легаси: Request.UserHostAddress). По нему ищется имя терминала в TerminalInfo
    // и терминалы с «неправильным счётчиком» — оба места должны видеть IP одинаково.
    public static string? GetClientIp(this HttpContext context) =>
        context.Connection.RemoteIpAddress?.ToString();
}

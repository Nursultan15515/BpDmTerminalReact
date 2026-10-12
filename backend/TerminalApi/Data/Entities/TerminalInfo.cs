namespace TerminalApi.Data.Entities;

// Сопоставление IP терминала с его именем (логином в SOAP-сервисе). Заполняется вручную в БД.
public partial class TerminalInfo
{
    public int Id { get; set; }

    public string? TerminalName { get; set; }

    public string? IpAddress { get; set; }
}

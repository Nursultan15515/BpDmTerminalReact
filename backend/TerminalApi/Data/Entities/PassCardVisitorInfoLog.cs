namespace TerminalApi.Data.Entities;

// Пошаговый лог выдачи карты конкретному посетителю (savePhoto, попытки SetVisitorsRFID и т.п.).
public partial class PassCardVisitorInfoLog
{
    public long Id { get; set; }

    public DateTime CreatedDateTime { get; set; }

    public string? PassCardVisitorId { get; set; }

    public string? RfidNumber { get; set; }

    public string? Notice { get; set; }
}

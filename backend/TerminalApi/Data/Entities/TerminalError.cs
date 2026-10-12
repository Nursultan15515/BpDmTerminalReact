namespace TerminalApi.Data.Entities;

// Лог ошибок терминала (IdAddress = IP терминала).
public partial class TerminalError
{
    public long Id { get; set; }

    public DateTime CreatedDate { get; set; }

    public string? IdAddress { get; set; }

    public string? Description { get; set; }

    public string? Notice { get; set; }
}

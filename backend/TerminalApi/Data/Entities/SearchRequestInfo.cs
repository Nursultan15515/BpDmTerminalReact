namespace TerminalApi.Data.Entities;

// Аудит каждого поиска посетителя: что искали, с какого IP и когда.
public partial class SearchRequestInfo
{
    public long Id { get; set; }

    public string? IpAddress { get; set; }

    public string? SearchValue { get; set; }

    public DateTime? CreatedDateTime { get; set; }
}

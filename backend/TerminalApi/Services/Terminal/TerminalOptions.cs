namespace TerminalApi.Services.Terminal;

public sealed class TerminalOptions
{
    /// <summary>
    /// IP терминалов с «неправильным счётчиком» карт: «карты заканчиваются» у них приходит как status 2, а не 1
    /// (легаси: список в HomeController.Index).
    /// </summary>
    public string[] WrongCardCounterIps { get; set; } = [];
}

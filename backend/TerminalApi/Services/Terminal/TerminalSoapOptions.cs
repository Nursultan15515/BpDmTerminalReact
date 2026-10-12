namespace TerminalApi.Services.Terminal;

public sealed class TerminalSoapOptions
{
    /// <summary>Адрес SOAP-сервиса в изолированной сети, напр. http://192.168.45.36/Services/TerminalService.asmx.</summary>
    public string Endpoint { get; set; } = "";

    /// <summary>Общий пароль терминала для Sender (логин = имя терминала, берётся по IP в рантайме).</summary>
    public string Password { get; set; } = "";

    /// <summary>На dev-машине SOAP недоступен — true подменяет клиент заглушкой, чтобы приложение запускалось.</summary>
    public bool UseStub { get; set; }
}

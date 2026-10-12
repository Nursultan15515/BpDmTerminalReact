using System.ServiceModel;
using Microsoft.Extensions.Options;
using TerminalApi.Services.Terminal.Soap;

namespace TerminalApi.Services.Terminal;

// Реальная обёртка над сгенерированным SOAP-клиентом. Каждый вызов поднимает свой клиент
// (как в легаси), подставляя Sender{User=terminalName, Password=options.Password}.
public sealed class TerminalSoapClient : ITerminalSoapClient
{
    private readonly TerminalSoapOptions _options;
    private readonly IPhotoBorderService _photoBorder;
    private readonly ILogger<TerminalSoapClient> _logger;

    public TerminalSoapClient(IOptions<TerminalSoapOptions> options, IPhotoBorderService photoBorder, ILogger<TerminalSoapClient> logger)
    {
        _options = options.Value;
        _photoBorder = photoBorder;
        _logger = logger;
    }

    public async Task<VisitorLookupResult> GetVisitorAsync(string documentNumber, string terminalName, CancellationToken ct = default)
    {
        var request = new RequestCard
        {
            RequestInfo = BuildRequestInfo(terminalName),
            RequestData = new RequestCardData { DocumentNumber = documentNumber },
        };

        var client = CreateClient();
        try
        {
            var response = await client.GetVisitorAsync(request);
            var card = response.Body.GetVisitorResult ?? throw EmptyResponse("GetVisitor");

            if (!card.Status)
                return new VisitorLookupResult(false, null, card.Message);

            return new VisitorLookupResult(true, Map(card), card.Message);
        }
        finally
        {
            await CloseAsync(client);
        }
    }

    public async Task<ServiceResult> SetVisitorsPhotoAsync(string cardId, string base64Photo, int dictPassCardTypeId, string terminalName, CancellationToken ct = default)
    {
        // Тип 3 (испытательный срок/временный пропуск) — фото с красной рамкой.
        var photo = dictPassCardTypeId == 3 ? _photoBorder.AddRedBorder(base64Photo) : base64Photo;

        var request = new RequestPhoto
        {
            RequestInfo = BuildRequestInfo(terminalName),
            RequestData = new RequestPhotoData { CardID = cardId, Base64Photo = photo },
        };

        var client = CreateClient();
        try
        {
            var response = await client.SetVisitorsPhotoAsync(request);
            return ToResult(response.Body.SetVisitorsPhotoResult, "SetVisitorsPhoto");
        }
        finally
        {
            await CloseAsync(client);
        }
    }

    public async Task<ServiceResult> SetVisitorsRfidAsync(string cardId, string rfidNumber, string terminalName, CancellationToken ct = default)
    {
        var request = new RequestRFID
        {
            RequestInfo = BuildRequestInfo(terminalName),
            RequestData = new RequestRFIDData { CardID = cardId, RFID_Number = rfidNumber },
        };

        var client = CreateClient();
        try
        {
            var response = await client.SetVisitorsRFIDAsync(request);
            return ToResult(response.Body.SetVisitorsRFIDResult, "SetVisitorsRFID");
        }
        finally
        {
            await CloseAsync(client);
        }
    }

    public async Task<ServiceResult> CardsEndedAsync(string terminalName, CancellationToken ct = default)
    {
        var request = new Request { RequestInfo = BuildRequestInfo(terminalName) };

        var client = CreateClient();
        try
        {
            var response = await client.CardsEndedAsync(request);
            return ToResult(response.Body.CardsEndedResult, "CardsEnded");
        }
        finally
        {
            await CloseAsync(client);
        }
    }

    private RequestInfo BuildRequestInfo(string terminalName) => new()
    {
        MessageID = Guid.NewGuid().ToString(),
        Sender = new Sender { User = terminalName, Password = _options.Password },
    };

    private TerminalService1SoapClient CreateClient() =>
        new(TerminalService1SoapClient.EndpointConfiguration.TerminalService1Soap, _options.Endpoint);

    private async Task CloseAsync(TerminalService1SoapClient client)
    {
        try
        {
            await client.CloseAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to close SOAP client gracefully; aborting");
            client.Abort();
        }
    }

    private static VisitorCard Map(ResponseCard card) => new(
        card.CardID,
        card.VisitorFullname,
        card.InvitersFullname,
        card.InvitersPhoneNumber,
        card.CabinetFloor,
        card.CabinetNumber,
        card.NeedPhoto,
        card.DictPassCardTypeId);

    private static ServiceResult ToResult(Response? response, string operation) =>
        response is null ? throw EmptyResponse(operation) : new ServiceResult(response.Status, response.Message);

    // Пустой ответ легаси считал сбоем («response is null» → ошибка, для RFID — карта не выдаётся),
    // а не Status=false: контроллеры обрабатывают его как недоступность сервиса.
    private static CommunicationException EmptyResponse(string operation) =>
        new($"TerminalService returned an empty {operation} response");
}

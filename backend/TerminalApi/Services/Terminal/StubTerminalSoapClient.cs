using System.ServiceModel;

namespace TerminalApi.Services.Terminal;

// Заглушка SOAP для стенда без изолированной сети (TerminalSoap:UseStub=true в Development).
// Исход задаёт последняя цифра номера документа; CardId = "STUB-" + номер, поэтому сценарий
// доходит и до фото, и до RFID:
//   …0 — пропуск не найден                   …1 — без фото, сразу выдача карты
//   …3 — тип 3 (фото с красной рамкой)        …5 — без фото, RFID «half success» (карта выдаётся)
//   …7 — без фото, сбой RFID (карта остаётся в аппарате)
//   …8 — сервис отказал в сохранении фото     …9 — SOAP недоступен
//   остальное — обычный посетитель с фото
// Сценарии RFID — без фото, чтобы проверять выдачу карты, не проходя камеру.
// Фото, которые ушли бы в SOAP, сохраняются в stub-photos/ — видно рамку и ориентацию снимка.
public sealed class StubTerminalSoapClient : ITerminalSoapClient
{
    // Задержка как у настоящего сервиса — чтобы на стенде были видны экраны загрузки.
    private static readonly TimeSpan Latency = TimeSpan.FromMilliseconds(500);

    private readonly string _photoDir;
    private readonly ILogger<StubTerminalSoapClient> _logger;

    public StubTerminalSoapClient(IHostEnvironment env, ILogger<StubTerminalSoapClient> logger)
    {
        _photoDir = Path.Combine(env.ContentRootPath, "stub-photos");
        _logger = logger;
    }

    public async Task<VisitorLookupResult> GetVisitorAsync(string documentNumber, string terminalName, CancellationToken ct = default)
    {
        await Task.Delay(Latency, ct);

        var scenario = Scenario(documentNumber);
        if (scenario == '0')
            return new VisitorLookupResult(false, null, "stub: not found");
        if (scenario == '9')
            throw new CommunicationException("stub: TerminalService unavailable");

        var card = new VisitorCard(
            CardId: "STUB-" + documentNumber,
            VisitorFullname: "Тестов Тест Тестович",
            InvitersFullname: "Ержан Нурсултан",
            InvitersPhoneNumber: "74-56-98",
            CabinetFloor: "1",
            CabinetNumber: "103",
            NeedPhoto: scenario is not ('1' or '5' or '7'),
            DictPassCardTypeId: scenario == '3' ? 3 : 1);

        return new VisitorLookupResult(true, card, "stub");
    }

    public async Task<ServiceResult> SetVisitorsPhotoAsync(string cardId, string base64Photo, string terminalName, CancellationToken ct = default)
    {
        await Task.Delay(Latency, ct);

        if (Scenario(cardId) == '8')
            return new ServiceResult(false, "stub: photo rejected");

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(base64Photo);
        }
        catch (FormatException)
        {
            // Настоящий сервис такое тоже не примет — пусть ошибка формата видна на стенде.
            _logger.LogWarning("Stub SOAP: Base64Photo for {CardId} is not valid base64", cardId);
            return new ServiceResult(false, "stub: Base64Photo is not valid base64");
        }

        Directory.CreateDirectory(_photoDir);
        var file = Path.Combine(_photoDir, $"{DateTime.Now:yyyyMMdd-HHmmss}-{SafeFileName(cardId)}.jpg");
        await File.WriteAllBytesAsync(file, bytes, ct);
        _logger.LogInformation("Stub SOAP: photo for {CardId} saved to {File}", cardId, file);

        return new ServiceResult(true, "stub");
    }

    public async Task<ServiceResult> SetVisitorsRfidAsync(string cardId, string rfidNumber, string terminalName, CancellationToken ct = default)
    {
        await Task.Delay(Latency, ct);

        return Scenario(cardId) switch
        {
            '5' => new ServiceResult(false, "stub: RFID already bound"),
            '7' => throw new CommunicationException("stub: SetVisitorsRFID failed"),
            _ => new ServiceResult(true, "stub"),
        };
    }

    public async Task<ServiceResult> CardsEndedAsync(string terminalName, CancellationToken ct = default)
    {
        await Task.Delay(Latency, ct);
        return new ServiceResult(true, "stub");
    }

    private static char Scenario(string value) => string.IsNullOrEmpty(value) ? ' ' : value[^1];

    private static string SafeFileName(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        return string.Concat(value.Select(c => invalid.Contains(c) ? '_' : c));
    }
}

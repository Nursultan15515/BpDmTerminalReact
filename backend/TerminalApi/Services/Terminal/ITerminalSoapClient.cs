namespace TerminalApi.Services.Terminal;

// Доменная обёртка над SOAP-сервисом TerminalService.asmx. Контроллеры работают с этими DTO,
// а не с сгенерированными типами из Services/Terminal/Soap.
public interface ITerminalSoapClient
{
    /// <summary>Ищет посетителя по номеру документа. Found=false означает «пропуск не найден» (Status=false от сервиса).</summary>
    Task<VisitorLookupResult> GetVisitorAsync(string documentNumber, string terminalName, CancellationToken ct = default);

    /// <summary>Сохраняет фото посетителя (чистый base64, рамку для типа 3 уже поставил контроллер).</summary>
    Task<ServiceResult> SetVisitorsPhotoAsync(string cardId, string base64Photo, string terminalName, CancellationToken ct = default);

    /// <summary>Регистрирует выданный RFID-номер за пропуском.</summary>
    Task<ServiceResult> SetVisitorsRfidAsync(string cardId, string rfidNumber, string terminalName, CancellationToken ct = default);

    /// <summary>Сообщает центральной системе, что в терминале закончились карты.</summary>
    Task<ServiceResult> CardsEndedAsync(string terminalName, CancellationToken ct = default);
}

public sealed record VisitorCard(
    string? CardId,
    string? VisitorFullname,
    string? InvitersFullname,
    string? InvitersPhoneNumber,
    string? CabinetFloor,
    string? CabinetNumber,
    bool NeedPhoto,
    int? DictPassCardTypeId);

public sealed record VisitorLookupResult(bool Found, VisitorCard? Card, string? Message);

public sealed record ServiceResult(bool Status, string? Message);

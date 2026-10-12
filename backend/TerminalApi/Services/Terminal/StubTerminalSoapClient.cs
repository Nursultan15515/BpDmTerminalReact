namespace TerminalApi.Services.Terminal;

// Заглушка на dev-машине, где SOAP-сервис изолированной сети недоступен.
// Включается через TerminalSoap:UseStub=true и отдаёт предсказуемого тестового посетителя.
public sealed class StubTerminalSoapClient : ITerminalSoapClient
{
    public Task<VisitorLookupResult> GetVisitorAsync(string documentNumber, string terminalName, CancellationToken ct = default)
    {
        // Документ, заканчивающийся на 0 — «не найден», чтобы тестировать обе ветки.
        if (documentNumber.EndsWith('0'))
            return Task.FromResult(new VisitorLookupResult(false, null, "stub: not found"));

        var card = new VisitorCard(
            CardId: "STUB-" + documentNumber,
            VisitorFullname: "Тестов Тест Тестович",
            InvitersFullname: "Ержан Нурсултан",
            InvitersPhoneNumber: "74-56-98",
            CabinetFloor: "1",
            CabinetNumber: "103",
            NeedPhoto: true,
            DictPassCardTypeId: 1);

        return Task.FromResult(new VisitorLookupResult(true, card, "stub"));
    }

    public Task<ServiceResult> SetVisitorsPhotoAsync(string cardId, string base64Photo, int dictPassCardTypeId, string terminalName, CancellationToken ct = default) =>
        Task.FromResult(new ServiceResult(true, "stub"));

    public Task<ServiceResult> SetVisitorsRfidAsync(string cardId, string rfidNumber, string terminalName, CancellationToken ct = default) =>
        Task.FromResult(new ServiceResult(true, "stub"));

    public Task<ServiceResult> CardsEndedAsync(string terminalName, CancellationToken ct = default) =>
        Task.FromResult(new ServiceResult(true, "stub"));
}

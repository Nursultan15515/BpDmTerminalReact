using System.ServiceModel;
using Microsoft.AspNetCore.Mvc;
using TerminalApi.Services.Face;
using TerminalApi.Services.Logging;
using TerminalApi.Services.Terminal;

namespace TerminalApi.Controllers;

[ApiController]
[Route("api/visitors")]
public class VisitorsController : ControllerBase
{
    private readonly ITerminalSoapClient _soap;
    private readonly ITerminalResolver _resolver;
    private readonly ITerminalLogService _log;
    private readonly IFaceDetectionService _faceDetection;
    private readonly IPhotoBorderService _photoBorder;
    private readonly ILogger<VisitorsController> _logger;

    public VisitorsController(
        ITerminalSoapClient soap,
        ITerminalResolver resolver,
        ITerminalLogService log,
        IFaceDetectionService faceDetection,
        IPhotoBorderService photoBorder,
        ILogger<VisitorsController> logger)
    {
        _soap = soap;
        _resolver = resolver;
        _log = log;
        _faceDetection = faceDetection;
        _photoBorder = photoBorder;
        _logger = logger;
    }

    private string? ClientIp => HttpContext.GetClientIp();

    // ИИН — 12 цифр, номер документа короче; всё, что длиннее, — мусорный ввод (легаси: MaxSearchValueLength).
    private const int MaxSearchValueLength = 30;

    // Поиск посетителя по номеру документа (легаси: Home/Search).
    [HttpPost("search")]
    public async Task<IActionResult> Search([FromBody] SearchRequest req, CancellationToken ct)
    {
        var ip = ClientIp;
        var searchValue = req?.SearchValue?.Trim();

        // Как в легаси: пустой или слишком длинный ввод (сбой сканера и т.п.) — в лог ошибок
        // и «не найдено», без запроса в SOAP.
        if (string.IsNullOrEmpty(searchValue) || searchValue.Length > MaxSearchValueLength)
        {
            var length = searchValue?.Length ?? 0;
            var head = searchValue?[..Math.Min(length, 50)];
            await _log.AddErrorAsync("searchValue is empty or too long", ip, $"Search; length={length}; searchValue={head}", ct);
            return NotFound(new { message = "searchValue is empty or too long" });
        }

        await _log.AddSearchRequestInfoAsync(searchValue, ip, ct);

        var terminalName = await _resolver.ResolveTerminalNameAsync(ip, ct);
        if (string.IsNullOrEmpty(terminalName))
        {
            await _log.AddErrorAsync("terminalName is null or empty", ip, $"Search; searchValue={searchValue}", ct);
            return StatusCode(StatusCodes.Status409Conflict, "terminal is not registered for this IP");
        }

        VisitorLookupResult lookup;
        try
        {
            lookup = await _soap.GetVisitorAsync(searchValue, terminalName, ct);
        }
        catch (Exception ex) when (IsSoapFailure(ex))
        {
            return await SoapErrorAsync(ex, ip, $"Search; searchValue={searchValue}");
        }

        await _log.AddSearchRequestInfoAsync($"{searchValue} - {lookup.Found}", ip, ct);

        if (!lookup.Found)
            return NotFound(new { message = lookup.Message });

        return Ok(lookup.Card);
    }

    // Сохранение фото посетителя (легаси: Home/SavePhoto).
    [HttpPost("photo")]
    public async Task<IActionResult> SavePhoto([FromBody] SavePhotoRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.CardId))
            return BadRequest("cardId is required");
        if (string.IsNullOrWhiteSpace(req.Base64Photo))
            return BadRequest("base64Photo is required");

        // Браузер шлёт data URI (data:image/jpeg;base64,…), а SOAP ждёт чистый base64 —
        // легаси срезал префикс перед отправкой (TakePhoto.cshtml). Иначе и рамка типа 3 не ставится.
        var photo = StripDataUriPrefix(req.Base64Photo);

        var ip = ClientIp;
        await _log.AddPassCardVisitorInfoLogAsync(req.CardId, "", "savePhoto", ct);

        var terminalName = await _resolver.ResolveTerminalNameAsync(ip, ct);
        if (string.IsNullOrEmpty(terminalName))
        {
            await _log.AddErrorAsync("terminalName is null or empty", ip, $"SavePhoto; cardId={req.CardId}", ct);
            return StatusCode(StatusCodes.Status409Conflict, "terminal is not registered for this IP");
        }

        // SOAP-сервис фото не валидирует — проверяем лицо локально ДО отправки.
        // Force=true приходит с последней попытки: принимаем кадр без проверки.
        if (!req.Force)
        {
            bool hasFace;
            try
            {
                hasFace = _faceDetection.HasFace(photo);
            }
            catch (InvalidImageException ex)
            {
                return BadRequest(ex.Message);
            }

            if (!hasFace)
                return UnprocessableEntity(new { error = "no_face", message = "Лицо не распознано. Переснимите фото." });
        }

        // Тип 3 (испытательный срок/временный пропуск) — фото с красной рамкой (легаси: ServiceHelper.SetVisitorsPhoto).
        // Рамку ставим до SOAP-клиента, чтобы её получала и заглушка стенда.
        if (req.DictPassCardTypeId == 3)
            photo = _photoBorder.AddRedBorder(photo);

        ServiceResult result;
        try
        {
            result = await _soap.SetVisitorsPhotoAsync(req.CardId, photo, terminalName, ct);
        }
        catch (Exception ex) when (IsSoapFailure(ex))
        {
            return await SoapErrorAsync(ex, ip, $"SavePhoto; cardId={req.CardId}");
        }

        // Status=false от сервиса — реальная ошибка сохранения (не «нет лица»):
        // отдаём жёсткую ошибку, чтобы фронт не принял её за повод переснять и не выдал карту.
        if (!result.Status)
        {
            await _log.AddErrorAsync($"response status false; {result.Message}", ip, $"SavePhoto; cardId={req.CardId}", ct);
            return StatusCode(StatusCodes.Status502BadGateway, new { message = result.Message });
        }

        return Ok();
    }

    // Регистрация выданного RFID (легаси: Home/SetVisitorsRFID). Возвращает {status}.
    // Сохраняем семантику легаси: даже «half success» от сервиса считается успехом для UI.
    [HttpPost("rfid")]
    public async Task<IActionResult> SetRfid([FromBody] SetRfidRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.CardId))
            return BadRequest("cardId is required");
        if (string.IsNullOrWhiteSpace(req.RfidNumber))
            return BadRequest("rfidNumber is required");

        var ip = ClientIp;
        await _log.AddPassCardVisitorInfoLogAsync(req.CardId, req.RfidNumber, "Try SetVisitorsRFID", ct);

        var terminalName = await _resolver.ResolveTerminalNameAsync(ip, ct);
        if (string.IsNullOrEmpty(terminalName))
        {
            await _log.AddErrorAsync("terminalName is null or empty", ip, $"SetVisitorsRFID; cardId={req.CardId}", ct);
            return Ok(new { status = false });
        }

        ServiceResult result;
        try
        {
            result = await _soap.SetVisitorsRfidAsync(req.CardId, req.RfidNumber, terminalName, ct);
        }
        catch (Exception ex) when (IsSoapFailure(ex))
        {
            await _log.AddErrorAsync(ex.ToString(), ip, $"SetVisitorsRFID; cardId={req.CardId}; rfidNumber={req.RfidNumber}", ct);
            return Ok(new { status = false });
        }

        // Как легаси: причину отказа сервиса — в TerminalError, сам шаг — в лог выдачи.
        if (!result.Status)
            await _log.AddErrorAsync($"response status false; {result.Message}", ip, $"SetVisitorsRFID; cardId={req.CardId}; rfidNumber={req.RfidNumber}", ct);

        var notice = result.Status ? "Success SetVisitorsRFID" : "Half success SetVisitorsRFID";
        await _log.AddPassCardVisitorInfoLogAsync(req.CardId, req.RfidNumber, notice, ct);

        // Легаси возвращает status=true и при Status==false (RFID уже сохранён на стороне сервиса).
        return Ok(new { status = true });
    }

    private async Task<IActionResult> SoapErrorAsync(Exception ex, string? ip, string context)
    {
        await _log.AddErrorAsync(ex.ToString(), ip, context, default);

        if (ex is TimeoutException)
        {
            _logger.LogWarning(ex, "SOAP service timed out ({Context})", context);
            return StatusCode(StatusCodes.Status504GatewayTimeout, "Terminal service did not respond in time.");
        }

        _logger.LogWarning(ex, "SOAP service unreachable ({Context})", context);
        return StatusCode(StatusCodes.Status502BadGateway, "Terminal service unreachable.");
    }

    private static bool IsSoapFailure(Exception ex) =>
        ex is CommunicationException or TimeoutException;

    private static string StripDataUriPrefix(string photo)
    {
        if (!photo.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
            return photo;
        var comma = photo.IndexOf(',');
        return comma >= 0 ? photo[(comma + 1)..] : photo;
    }
}

public sealed record SearchRequest(string SearchValue);

public sealed record SavePhotoRequest(string CardId, string Base64Photo, int DictPassCardTypeId, bool Force = false);

public sealed record SetRfidRequest(string CardId, string RfidNumber);

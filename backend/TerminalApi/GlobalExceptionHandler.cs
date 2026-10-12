using System.Data.Common;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace TerminalApi;

// Единая «сетка безопасности»: всё, что не поймали в контроллерах (сбой БД и пр.),
// превращается в аккуратный ProblemDetails вместо сырого 500.
public sealed class GlobalExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetails;
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(IProblemDetailsService problemDetails, ILogger<GlobalExceptionHandler> logger)
    {
        _problemDetails = problemDetails;
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var (status, title) = Map(exception);

        _logger.LogError(exception, "Unhandled exception -> {Status} {Title}", status, title);

        httpContext.Response.StatusCode = status;

        return await _problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = new ProblemDetails
            {
                Status = status,
                Title = title,
            },
        });
    }

    private static (int Status, string Title) Map(Exception exception) =>
        IsDatabaseFailure(exception)
            ? (StatusCodes.Status503ServiceUnavailable, "Database unavailable.")
            : (StatusCodes.Status500InternalServerError, "Internal server error.");

    private static bool IsDatabaseFailure(Exception? exception)
    {
        for (; exception is not null; exception = exception.InnerException)
            if (exception is DbException)
                return true;
        return false;
    }
}

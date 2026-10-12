using Microsoft.EntityFrameworkCore;
using Serilog;
using TerminalApi;
using TerminalApi.Data;
using TerminalApi.Services.Face;
using TerminalApi.Services.Logging;
using TerminalApi.Services.Terminal;

// Bootstrap logger: ловит сбои ещё до того, как поднимется хост и прочитается конфиг.
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .WriteTo.File("logs/app-.log", rollingInterval: RollingInterval.Day)
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog((ctx, lc) => lc.ReadFrom.Configuration(ctx.Configuration));

    builder.Services.AddOpenApi();
    builder.Services.AddControllers();

    builder.Services.AddProblemDetails();
    builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

    builder.Services.AddDbContext<TerminalEntities>(options =>
        options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

    // ─── SOAP integration (TerminalService.asmx в изолированной сети) ──────────────
    builder.Services.Configure<TerminalSoapOptions>(builder.Configuration.GetSection("TerminalSoap"));
    builder.Services.AddSingleton<IPhotoBorderService, PhotoBorderService>();
    // Проверка лица локально (OpenCV) ДО отправки в SOAP — сам сервис лицо не валидирует.
    builder.Services.AddSingleton<IFaceDetectionService, FaceDetectionService>();
    builder.Services.AddScoped<ITerminalResolver, TerminalResolver>();

    // На dev-машине SOAP недоступен → подменяем заглушкой (TerminalSoap:UseStub=true).
    if (builder.Configuration.GetValue<bool>("TerminalSoap:UseStub"))
        builder.Services.AddScoped<ITerminalSoapClient, StubTerminalSoapClient>();
    else
        builder.Services.AddScoped<ITerminalSoapClient, TerminalSoapClient>();

    // Терминалы с «неправильным счётчиком» карт (легаси: список IP в HomeController.Index).
    // С самим диспенсером (localhost:8080 на терминале) работает браузер, не бэкенд.
    builder.Services.Configure<TerminalOptions>(builder.Configuration.GetSection("Terminal"));

    // Аудит/лог терминала в таблицы SearchRequestInfo / PassCardVisitorInfoLog / TerminalError.
    builder.Services.AddScoped<ITerminalLogService, TerminalLogService>();

    builder.Services.AddCors(options =>
    {
        options.AddPolicy("DevPolicy", policy =>
        {
            policy.WithOrigins("http://localhost:3000")
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        });
    });

    var app = builder.Build();

    app.UseExceptionHandler();

    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
        app.UseCors("DevPolicy");
    }
    else
    {
        app.UseHttpsRedirection();
    }

    app.MapGet("/api/ping", () => Results.Ok(new { message = "pong", time = DateTime.UtcNow }));

    app.MapControllers();

    Log.Information("TerminalApi started in {Environment} mode", app.Environment.EnvironmentName);

    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "TerminalApi failed to start");
}
finally
{
    Log.CloseAndFlush();
}

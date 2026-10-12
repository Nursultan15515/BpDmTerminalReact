using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.Versioning;

namespace TerminalApi.Services.Terminal;

public interface IPhotoBorderService
{
    /// <summary>Добавляет красную рамку к base64-изображению (для типа пропуска 3). При сбое возвращает исходное фото.</summary>
    string AddRedBorder(string base64Photo);
}

// Порт AddBorderToBase64 из легаси. System.Drawing на Windows — целевая платформа терминала.
[SupportedOSPlatform("windows")]
public sealed class PhotoBorderService : IPhotoBorderService
{
    private const int Thickness = 16;

    private readonly ILogger<PhotoBorderService> _logger;

    public PhotoBorderService(ILogger<PhotoBorderService> logger)
    {
        _logger = logger;
    }

    public string AddRedBorder(string base64Photo)
    {
        try
        {
            byte[] bytes = Convert.FromBase64String(base64Photo);
            using var ms = new MemoryStream(bytes);
            using var original = Image.FromStream(ms);

            int newW = original.Width + Thickness * 2;
            int newH = original.Height + Thickness * 2;

            using var bmp = new Bitmap(newW, newH);
            using var g = Graphics.FromImage(bmp);
            using var pen = new Pen(Color.Red, Thickness);

            g.Clear(Color.Red);
            g.DrawImage(original, Thickness, Thickness, original.Width, original.Height);
            g.DrawRectangle(pen, Thickness + Thickness / 2, Thickness + Thickness / 2,
                original.Width - Thickness, original.Height - Thickness);

            using var outMs = new MemoryStream();
            bmp.Save(outMs, original.RawFormat.Guid == ImageFormat.Png.Guid ? ImageFormat.Png : ImageFormat.Jpeg);
            return Convert.ToBase64String(outMs.ToArray());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to add red border to photo; sending original");
            return base64Photo;
        }
    }
}

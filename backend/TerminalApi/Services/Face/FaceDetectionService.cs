using OpenCvSharp;

namespace TerminalApi.Services.Face;

public interface IFaceDetectionService
{
    /// <summary>True if at least one face is detected in the given image.</summary>
    /// <exception cref="InvalidImageException">The base64 payload could not be decoded as an image.</exception>
    bool HasFace(string base64Image);
}

public sealed class InvalidImageException(string message) : Exception(message);

public sealed class FaceDetectionService : IFaceDetectionService
{
    private readonly string _cascadePath;

    public FaceDetectionService()
    {
        _cascadePath = Path.Combine(AppContext.BaseDirectory, "Resources", "haarcascade_frontalface_default.xml");
        if (!File.Exists(_cascadePath))
            throw new FileNotFoundException("Face cascade not found", _cascadePath);
    }

    public bool HasFace(string base64Image)
    {
        var bytes = DecodeBase64(base64Image);

        // CascadeClassifier is not thread-safe — create one per call (cheap enough for kiosk traffic).
        using var cascade = new CascadeClassifier(_cascadePath);
        using var image = Cv2.ImDecode(bytes, ImreadModes.Color);
        if (image.Empty())
            throw new InvalidImageException("Image could not be decoded.");

        using var gray = new Mat();
        Cv2.CvtColor(image, gray, ColorConversionCodes.BGR2GRAY);
        Cv2.EqualizeHist(gray, gray);

        // minNeighbors повышен (5→8) и minSize увеличен, чтобы отсечь ложные
        // срабатывания на «лицеподобных» текстурах (доска, рисунки, пятна на стене).
        var faces = cascade.DetectMultiScale(
            gray,
            scaleFactor: 1.1,
            minNeighbors: 8,
            flags: HaarDetectionTypes.ScaleImage,
            minSize: new Size(110, 110));

        return faces.Length > 0;
    }

    private static byte[] DecodeBase64(string base64Image)
    {
        if (string.IsNullOrWhiteSpace(base64Image))
            throw new InvalidImageException("Image payload is empty.");

        // Strip a possible data-URI prefix ("data:image/jpeg;base64,...").
        var comma = base64Image.IndexOf(',');
        var payload = comma >= 0 ? base64Image[(comma + 1)..] : base64Image;

        try
        {
            return Convert.FromBase64String(payload);
        }
        catch (FormatException)
        {
            throw new InvalidImageException("Image payload is not valid base64.");
        }
    }
}

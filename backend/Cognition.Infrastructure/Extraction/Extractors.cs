using Cognition.Domain.Interfaces;

namespace Cognition.Infrastructure.Extraction;

public class PlainTextExtractor : ITextExtractor
{
    public bool Supports(string fileType) =>
        fileType.Equals("txt", StringComparison.OrdinalIgnoreCase) ||
        fileType.Equals("md", StringComparison.OrdinalIgnoreCase) ||
        fileType.Equals("csv", StringComparison.OrdinalIgnoreCase);

    public async Task<string> ExtractAsync(Stream stream, string fileType)
    {
        using var reader = new StreamReader(stream);
        return await reader.ReadToEndAsync();
    }
}

public class PdfExtractor : ITextExtractor
{
    public bool Supports(string fileType) => fileType.Equals("pdf", StringComparison.OrdinalIgnoreCase);

    public async Task<string> ExtractAsync(Stream stream, string fileType)
    {
        // Production: utiliser PdfPig ou Azure Document Intelligence.
        // Implémentation de repli utilisant iText ou PdfPig via package.
        // Ici abstraction; brancher PdfPig dans Cognition.AI/Infrastructure.
        var text = await new PdfPigExtractor().ExtractAsync(stream, fileType);
        return text;
    }
}

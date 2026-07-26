using Cognition.Domain.Interfaces;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace Cognition.Infrastructure.Extraction;

public class PdfPigExtractor : ITextExtractor
{
    public bool Supports(string fileType) => fileType.Equals("pdf", StringComparison.OrdinalIgnoreCase);

    public async Task<string> ExtractAsync(Stream stream, string fileType)
    {
        var sb = new System.Text.StringBuilder();
        // PdfPig est synchrone; on délègue via Task.Run pour ne pas bloquer.
        await Task.Run(() =>
        {
            using var document = PdfDocument.Open(stream);
            foreach (var page in document.GetPages())
            {
                sb.AppendLine($"[PAGE {page.Number}]");
                sb.AppendLine(page.Text);
            }
        });
        return sb.ToString();
    }
}

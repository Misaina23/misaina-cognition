using Cognition.Domain.Interfaces;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace Cognition.Infrastructure.Extraction;

public class WordExtractor : ITextExtractor
{
    public bool Supports(string fileType) =>
        fileType.Equals("docx", StringComparison.OrdinalIgnoreCase);

    public async Task<string> ExtractAsync(Stream stream, string fileType)
    {
        return await Task.Run(() =>
        {
            using var doc = WordprocessingDocument.Open(stream, false);
            var body = doc.MainDocumentPart?.Document.Body;
            return body?.InnerText ?? string.Empty;
        });
    }
}

public class ExcelExtractor : ITextExtractor
{
    public bool Supports(string fileType) =>
        fileType.Equals("xlsx", StringComparison.OrdinalIgnoreCase);

    public async Task<string> ExtractAsync(Stream stream, string fileType)
    {
        return await Task.Run(() =>
        {
            var sb = new System.Text.StringBuilder();
            using var workbook = SpreadsheetDocument.Open(stream, false);
            var sheets = workbook.WorkbookPart?.WorksheetParts;
            if (sheets == null) return string.Empty;
            foreach (var sheet in sheets)
            {
                var rows = sheet.Worksheet.Descendants<DocumentFormat.OpenXml.Spreadsheet.Row>();
                foreach (var row in rows)
                {
                    var cells = row.Descendants<DocumentFormat.OpenXml.Spreadsheet.Cell>()
                        .Select(c => c.CellValue?.Text ?? c.InnerText ?? "");
                    sb.AppendLine(string.Join("\t", cells));
                }
            }
            return sb.ToString();
        });
    }
}

public class PowerPointExtractor : ITextExtractor
{
    public bool Supports(string fileType) =>
        fileType.Equals("pptx", StringComparison.OrdinalIgnoreCase);

    public async Task<string> ExtractAsync(Stream stream, string fileType)
    {
        return await Task.Run(() =>
        {
            var sb = new System.Text.StringBuilder();
            using var pres = PresentationDocument.Open(stream, false);
            foreach (var slide in pres.PresentationPart?.SlideParts ?? Enumerable.Empty<SlidePart>())
            {
                sb.AppendLine(slide.Slide.InnerText);
            }
            return sb.ToString();
        });
    }
}

public class CompositeTextExtractor : ITextExtractor
{
    private readonly IEnumerable<ITextExtractor> _extractors;
    public CompositeTextExtractor(IEnumerable<ITextExtractor> extractors) => _extractors = extractors;

    public bool Supports(string fileType) => _extractors.Any(e => e.Supports(fileType));

    public async Task<string> ExtractAsync(Stream stream, string fileType)
    {
        var extractor = _extractors.FirstOrDefault(e => e.Supports(fileType))
            ?? throw new NotSupportedException($"Type non supporté: {fileType}");
        return await extractor.ExtractAsync(stream, fileType);
    }
}

using Cognition.Domain.Entities;

namespace Cognition.AI.Rag;

public class IntelligentChunker
{
    private const int MaxChunkSize = 1000;
    private const int Overlap = 100;

    public IEnumerable<DocumentChunk> Chunk(string content, Guid documentId)
    {
        var matches = System.Text.RegularExpressions.Regex.Matches(content, @"\[PAGE (\d+)\]");
        var segments = new List<(string Text, int Page)>();

        if (matches.Count == 0)
        {
            segments.Add((content.Trim(), 1));
        }
        else
        {
            for (int i = 0; i < matches.Count; i++)
            {
                var pageNum = int.Parse(matches[i].Groups[1].Value);
                var start = matches[i].Index + matches[i].Length;
                var end = i + 1 < matches.Count ? matches[i + 1].Index : content.Length;
                var text = content.Substring(start, end - start).Trim();
                if (!string.IsNullOrWhiteSpace(text))
                    segments.Add((text, pageNum));
            }
        }

        var index = 0;
        foreach (var (text, page) in segments)
        {
            foreach (var piece in SplitBySize(text, MaxChunkSize, Overlap))
            {
                yield return new DocumentChunk
                {
                    DocumentId = documentId,
                    Content = piece,
                    PageNumber = page,
                    ChunkIndex = index++,
                    Metadata = System.Text.Json.JsonSerializer.Serialize(new
                    {
                        page,
                        length = piece.Length
                    })
                };
            }
        }
    }

    private static IEnumerable<string> SplitBySize(string text, int max, int overlap)
    {
        if (text.Length <= max) { yield return text; yield break; }
        var start = 0;
        while (start < text.Length)
        {
            var end = Math.Min(start + max, text.Length);
            yield return text.Substring(start, end - start);
            start += max - overlap;
        }
    }
}

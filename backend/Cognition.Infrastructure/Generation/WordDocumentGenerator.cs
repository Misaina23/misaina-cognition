using Cognition.Domain.Interfaces;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace Cognition.Infrastructure.Generation;

public class WordDocumentGenerator : IDocumentGenerator
{
    public byte[] Generate(GeneratedDocumentRequest request)
    {
        using var ms = new MemoryStream();
        using (var doc = WordprocessingDocument.Create(ms, DocumentFormat.OpenXml.WordprocessingDocumentType.Document))
        {
            var main = doc.AddMainDocumentPart();
            main.Document = new Document();
            var body = main.Document.AppendChild(new Body());

            void Heading(string t)
            {
                var p = body.AppendChild(new Paragraph());
                var r = p.AppendChild(new Run());
                r.AppendChild(new RunProperties(new Bold(), new FontSize { Val = "28" }));
                r.AppendChild(new Text(t));
            }
            void Para(string t)
            {
                var p = body.AppendChild(new Paragraph());
                p.AppendChild(new Run()).AppendChild(new Text(t));
            }

            Heading("Misaina Cognition - Document généré");
            Para($"Date de génération : {request.GeneratedAt:dd/MM/yyyy HH:mm}");
            Para($"Utilisateur : {request.UserName} ({request.Department})");
            body.AppendChild(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { After = "200" })));

            Heading("Question posée");
            Para(request.Question);
            body.AppendChild(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { After = "200" })));

            Heading("Réponse générée");
            Para(request.Answer);
            body.AppendChild(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { After = "200" })));

            Heading("Informations extraites des documents sources");
            foreach (var s in request.Sources)
            {
                Para($"- {s.DocumentTitle}" + (s.PageNumber.HasValue ? $" (Page {s.PageNumber})" : ""));
                if (!string.IsNullOrEmpty(s.Excerpt)) Para($"   Extrait : {s.Excerpt}");
            }
            body.AppendChild(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { After = "200" })));

            Heading("Références");
            foreach (var s in request.Sources)
                Para($"📄 {s.DocumentTitle}" + (s.PageNumber.HasValue ? $" - Page {s.PageNumber}" : ""));

            main.Document.Save();
        }
        return ms.ToArray();
    }
}

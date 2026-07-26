SELECT d."Status", COUNT(c."Id") AS chunks
FROM "Documents" d
LEFT JOIN "DocumentChunks" c ON c."DocumentId" = d."Id"
GROUP BY d."Status";

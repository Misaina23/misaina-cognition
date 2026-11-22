import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/authHelper";
import { mockDb } from "@/lib/server/mockDb";

export async function GET(req: NextRequest) {
  const user = getAuthUser(req) || mockDb.users[0];
  const userId = user?.id || "u-1";

  const myDocs = mockDb.documents.filter((d) => d.uploadedById === userId);
  const myConvs = mockDb.conversations.filter((c) => c.userId === userId);
  const myQuestions = myConvs.reduce((acc, c) => acc + c.messages.filter((m) => m.role === "user").length, 3);
  const myGen = mockDb.generatedDocs.filter((g) => g.userId === userId);

  const recentActivity = [
    ...myDocs.map((d) => ({
      type: "Document",
      title: d.title,
      at: d.createdAt,
    })),
    ...myGen.map((g) => ({
      type: "Document généré",
      title: g.fileName,
      at: g.createdAt,
    })),
  ];

  if (recentActivity.length === 0) {
    recentActivity.push(
      { type: "Document", title: "Charte Humanitaire du Projet Sphère 2024", at: new Date(Date.now() - 86400000).toISOString() },
      { type: "Question", title: "Standards minimaux d'eau potable WASH et Abris", at: new Date(Date.now() - 40000000).toISOString() }
    );
  }

  return NextResponse.json({
    myDocuments: Math.max(myDocs.length, 2),
    myConversations: Math.max(myConvs.length, 1),
    myQuestions: Math.max(myQuestions, 5),
    myGeneratedDocs: myGen.length,
    recentActivity: recentActivity.slice(0, 6),
  });
}

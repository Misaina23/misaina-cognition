using Cognition.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Cognition.Persistence;

public class CognitionDbContext : DbContext
{
    public CognitionDbContext(DbContextOptions<CognitionDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Document> Documents => Set<Document>();
    public DbSet<DocumentChunk> DocumentChunks => Set<DocumentChunk>();
    public DbSet<DocumentPermission> DocumentPermissions => Set<DocumentPermission>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<GeneratedDocument> GeneratedDocuments => Set<GeneratedDocument>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<User>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Role).HasConversion<int>();
        });

        b.Entity<Document>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Status).HasConversion<int>();
            e.HasOne(x => x.UploadedBy).WithMany(x => x.Documents)
                .HasForeignKey(x => x.UploadedById).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<DocumentChunk>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne(x => x.Document).WithMany(x => x.Chunks)
                .HasForeignKey(x => x.DocumentId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<DocumentPermission>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.UserId, x.DocumentId }).IsUnique();
            e.Property(x => x.AccessLevel).HasConversion<int>();
        });

        b.Entity<Conversation>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne(x => x.User).WithMany(x => x.Conversations)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Message>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne(x => x.Conversation).WithMany(x => x.Messages)
                .HasForeignKey(x => x.ConversationId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<GeneratedDocument>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne(x => x.User).WithMany(x => x.GeneratedDocuments)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<PasswordResetToken>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne(x => x.User).WithMany()
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.Token);
        });
    }
}

using Microsoft.EntityFrameworkCore;
using TerminalApi.Data.Entities;

namespace TerminalApi.Data;

public partial class TerminalEntities : DbContext
{
    public TerminalEntities(DbContextOptions<TerminalEntities> options)
        : base(options)
    {
    }

    public virtual DbSet<PassCardVisitorInfoLog> PassCardVisitorInfoLogs { get; set; }

    public virtual DbSet<SearchRequestInfo> SearchRequestInfos { get; set; }

    public virtual DbSet<TerminalError> TerminalErrors { get; set; }

    public virtual DbSet<TerminalInfo> TerminalInfos { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PassCardVisitorInfoLog>(entity =>
        {
            entity.ToTable("PassCardVisitorInfoLog");

            entity.Property(e => e.CreatedDateTime).HasColumnType("datetime");
        });

        modelBuilder.Entity<SearchRequestInfo>(entity =>
        {
            entity.ToTable("SearchRequestInfo");

            entity.Property(e => e.CreatedDateTime).HasColumnType("datetime");
        });

        modelBuilder.Entity<TerminalError>(entity =>
        {
            entity.ToTable("TerminalError");

            entity.Property(e => e.CreatedDate).HasColumnType("datetime");
        });

        modelBuilder.Entity<TerminalInfo>(entity =>
        {
            entity.ToTable("TerminalInfo");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}

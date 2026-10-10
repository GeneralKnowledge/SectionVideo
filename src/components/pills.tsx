export function Pills({ labels }: { labels: string[] }) {
  return (
    <div className="pills">
      {labels.map((label) => (
        <span
          key={label}
          className={`pill ${
            label === "Extraction failed"
              ? "bad"
              : label === "Manual review required"
                ? "warn"
                : label.endsWith("available")
                  ? "good"
                  : ""
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "approved" || status === "published" || status === "imported"
      ? "good"
      : status === "rejected" || status === "failed" || status === "deleted"
        ? "bad"
        : "warn";
  return <span className={`pill ${tone}`}>{status.replaceAll("_", " ")}</span>;
}

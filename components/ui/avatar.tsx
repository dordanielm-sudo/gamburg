import { TONE_SOLID, hashTone } from "./badge";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? "") + (parts[1][0] ?? "");
}

export function Avatar({
  name,
  size = "h-7 w-7 text-[11px]",
}: {
  name: string;
  size?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${size} ${TONE_SOLID[hashTone(name)]}`}
    >
      {initials(name)}
    </span>
  );
}

export function NamedAvatar({
  name,
  size,
  className = "",
}: {
  name: string;
  size?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Avatar name={name} size={size} />
      <span>{name}</span>
    </span>
  );
}

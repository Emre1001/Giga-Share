import { avatarStyle, initials } from "../lib/api";

export function Avatar({ id, name, online, size = 40 }: { id: string; name: string; online?: boolean | null; size?: number }) {
  return (
    <span className="avatar" style={{ ...avatarStyle(id), width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
      {online !== undefined && <i className={`presence ${online === null ? "unk" : online ? "on" : "off"}`} />}
    </span>
  );
}

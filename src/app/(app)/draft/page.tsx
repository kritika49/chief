import { redirect } from "next/navigation";

/** The draft now lives on Home; keep old links and bookmarks working. */
export default function DraftPage() {
  redirect("/today#draft");
}

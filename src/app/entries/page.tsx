import { redirect } from "next/navigation";

export default function EntriesLegacyPage() {
  redirect("/dashboard/entries");
}

import { redirect } from "next/navigation";

// proxy.ts already sends unauthenticated visitors to /login, so anyone
// reaching this page is signed in - straight to the main tab.
export default function Home() {
  redirect("/cases");
}

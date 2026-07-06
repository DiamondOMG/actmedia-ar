import { redirect } from "next/navigation";

export default async function ARPageRedirect(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await props.searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      urlParams.append(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v) urlParams.append(key, v);
      });
    }
  }
  const queryString = urlParams.toString();
  redirect(`/ar/navigate${queryString ? `?${queryString}` : ""}`);
}

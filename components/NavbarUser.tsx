"use client";

import { UserButton } from "@clerk/nextjs";

export default function NavbarUser() {
  return (
    <UserButton
      afterSignOutUrl="/"
      appearance={{
        elements: {
          avatarBox: "h-8 w-8",
        },
      }}
    />
  );
}

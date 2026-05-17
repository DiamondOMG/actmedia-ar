"use client";

import { UserButton } from "@clerk/nextjs";

export default function NavbarUser() {
  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: "h-8 w-8",
        },
      }}
    />
  );
}

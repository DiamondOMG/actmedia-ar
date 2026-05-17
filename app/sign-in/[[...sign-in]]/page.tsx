import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-950">
      <SignIn 
        appearance={{
          elements: {
            // ปรับแต่งสีปุ่มหลักให้เป็นสีม่วงเข้ากับโปรเจคของคุณ
            formButtonPrimary: "bg-purple-600 hover:bg-purple-700 text-sm normal-case",
          }
        }} 
      />
    </div>
  );
}

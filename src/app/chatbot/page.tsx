import { redirect } from 'next/navigation';

export default function ChatbotPage() {
  redirect('/?chat=true');
}

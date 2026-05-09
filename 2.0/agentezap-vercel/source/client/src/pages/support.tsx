import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

export default function Support() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Central de Suporte</h1>
      <Card>
        <CardHeader>
          <CardTitle>Entre em Contato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder="Nome" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          <Input placeholder="Email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
          <Input placeholder="Assunto" value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} />
          <Textarea placeholder="Mensagem" value={form.message} onChange={e => setForm({...form, message: e.target.value})} />
          <Button>Enviar</Button>
        </CardContent>
      </Card>
    </div>
  );
}

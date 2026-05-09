import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function AdminStatusPanel() {
  const [message, setMessage] = useState("");
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Status WhatsApp</h1>
      <Card>
        <CardHeader>
          <CardTitle>Configuração de Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Mensagem de Status</label>
            <Input 
              value={message} 
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite a mensagem de status..."
            />
          </div>
          <Button>Salvar Configuração</Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * RF05.3 — gera o link de rota do Google Maps para um endereço de entrega.
 * O formato "dir/?api=1" abre diretamente o app de mapas no celular,
 * sem necessidade de chave de API.
 */
export function buildDirectionsLink(destination: string): string {
  const encoded = encodeURIComponent(`${destination}, Sinop - MT`);
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
}

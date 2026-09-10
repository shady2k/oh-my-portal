export function GET() {
  return new Response('# UI kit\n\nDevelopment catalog of the field journal components. See src/components/ui/README.md for the component contracts.\n', {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}

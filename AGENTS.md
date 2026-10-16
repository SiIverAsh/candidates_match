# Project architecture

This project uses React, TypeScript, and Vite.

Keep feature modules strictly layered: `domain` has no framework dependencies, `application` depends only on domain types and declared ports, `infrastructure` implements ports, `presentation` contains React and HTTP contracts, and `composition.ts` wires concrete dependencies.

Do not move business rules into React components or HTTP handlers.

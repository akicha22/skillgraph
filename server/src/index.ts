import { env } from "./env";
import { app } from "./app";

app.listen(env.PORT, () => console.log(`API running on http://localhost:${env.PORT}`));
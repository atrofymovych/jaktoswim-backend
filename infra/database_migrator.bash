mongodump \
  --uri="mongodb+srv://test:test@jaktoswim.ba9tpb6.mongodb.net/test" \
  --out="./backups/"

mongodump \
  --uri="mongodb+srv://test:test@jaktoswim.ba9tpb6.mongodb.net/zdrowow" \
  --out="./backups/"

mongodump \
  --uri="mongodb+srv://test:test@jaktoswim.ba9tpb6.mongodb.net/morcars" \
  --out="./backups/"



mongorestore \
  --uri="mongodb://test:test@173.249.25.64/zdrowow?authSource=zdrowow" \
  --nsFrom="zdrowow.*" \
  --nsTo="zdrowow.*" \
  --drop \
  backups/zdrowow/


mongorestore \
  --uri="mongodb://test:test@173.249.25.64/jaktoswim?authSource=jaktoswim" \
  --nsFrom="jaktoswim.*" \
  --nsTo="jaktoswim.*" \
  --drop \
  backups/jaktoswim/

mongorestore \
  --uri="mongodb://test:test@173.249.25.64/morcars?authSource=morcars" \
  --nsFrom="morcars.*" \
  --nsTo="morcars.*" \
  --drop \
  backups/morcars/

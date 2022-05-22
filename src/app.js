const express = require('express');
const cors = require('cors');

const { serverPort } = require('./config');

const UserRoutes = require('./routes/v1/users');
const ExerciseRoutes = require('./routes/v1/exercises');
const SetsRoutes = require('./routes/v1/sets');

const app = express();
app.use(express.json());
app.use(cors());

app.get('/', async (req, res) => {
  res.send({ msg: 'Server is running' });
});

app.use('/v1/users/', UserRoutes);
app.use('/v1/exercises/', ExerciseRoutes);
app.use('/v1/sets/', SetsRoutes);

app.all('*', (req, res) => {
  res.status(404).send({ err: 'Page not found' });
});

app.listen(serverPort, () => console.log(`Server is running on port ${serverPort}`));

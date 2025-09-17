import { createClient } from 'https://esm.sh/@supabase/supabase-js'

// Reemplaza estos valores con tus propios datos de la API de Supabase
const SUPABASE_URL = 'https://wywcuhdexiiitliibpnu.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5d2N1aGRleGlpaXRsaWlicG51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyMDU1NDAsImV4cCI6MjA3Mjc4MTU0MH0.d0tXuL0TR0807doulx-K_cXpj670QTJvv27oNYqG_is'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Referencia al contenedor para el clima de hoy
const weatherInfoDiv = document.getElementById('weather-info');

// Referencia al botón y al contenedor del historial
const showHistoryButton = document.getElementById('show-history');
const weatherHistoryDiv = document.getElementById('weather-history');

// Función para obtener el clima de hoy
async function getWeather() {
  const today = new Date().toISOString().slice(0, 10); // Formato YYYY-MM-DD
  const tomorrow = new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().slice(0, 10);

  let { data: readings, error } = await supabase
    .from('readings') // CAMBIO: Usamos el nombre de tu tabla "readings"
    .select('temperature')
    .gte('time', today) // CAMBIO: Filtramos por el rango de fechas de hoy en la columna "time"
    .lt('time', tomorrow)
    .single();

  if (error) {
    console.error('Error al obtener el clima:', error.message);
    weatherInfoDiv.textContent = 'Hubo un error al cargar los datos del clima.';
  } else if (readings) {
    weatherInfoDiv.textContent = `La temperatura de hoy es: ${readings.temperature}°C`;
  } else {
    weatherInfoDiv.textContent = 'No hay datos de clima disponibles para hoy.';
  }
}

// NUEVA FUNCIÓN: Obtiene todo el historial de la base de datos
async function getWeatherHistory() {
  weatherHistoryDiv.textContent = 'Cargando historial...';

  // Usa select('*') para obtener todas las columnas de todos los registros
  let { data: history, error } = await supabase
    .from('readings') // CAMBIO: Usamos el nombre de tu tabla "readings"
    .select('*')
    .order('time', { ascending: false }); // CAMBIO: Ordenamos por la columna "time"

  if (error) {
    console.error('Error al obtener el historial:', error.message);
    weatherHistoryDiv.textContent = 'Hubo un error al cargar el historial.';
  } else if (history.length > 0) {
    weatherHistoryDiv.innerHTML = ''; 
    history.forEach(day => {
      const p = document.createElement('p');
  // Formatear fecha a 'lun 23/9'
  const dateObj = new Date(day.time);
  const dias = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
  const dia = dias[dateObj.getDay()];
  const fecha = `${dia} ${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
  // Agregar comentario al costado
  p.textContent = `Fecha: ${fecha} - Temperatura: ${day.temperature}°C  // Comentario: día histórico`;
      weatherHistoryDiv.appendChild(p);
    });
  } else {
    weatherHistoryDiv.textContent = 'No hay historial de clima disponible.';
  }
}

// Llama a la función de clima de hoy al cargar la página
getWeather();

// Agrega un "listener" al botón para que llame a la función del historial
showHistoryButton.addEventListener('click', getWeatherHistory);
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * Location suggestions for the profile and requirements-post forms.
 *
 * A curated static list, not a paid geocoding service: the product only needs city-level places
 * recruiters and candidates actually type. Free text is still allowed everywhere this is used, so a
 * place that is missing from the list can still be entered.
 */
// `aliases` carry the spellings people actually type (Bangalore for Bengaluru, Bombay for Mumbai),
// so the suggestion works for the name in the user's head, not only the official one.
type Place = { name: string; region: string; country: string; aliases?: string[] };

const PLACES: Place[] = [
  { name: "Ahmedabad", region: "Gujarat", country: "India" },
  { name: "Aizawl", region: "Mizoram", country: "India" },
  { name: "Ajmer", region: "Rajasthan", country: "India" },
  { name: "Agra", region: "Uttar Pradesh", country: "India" },
  { name: "Aligarh", region: "Uttar Pradesh", country: "India" },
  { name: "Amritsar", region: "Punjab", country: "India" },
  { name: "Aurangabad", region: "Maharashtra", country: "India" },
  { name: "Bengaluru", region: "Karnataka", country: "India", aliases: ["Bangalore", "Bengalooru"] },
  { name: "Belagavi", region: "Karnataka", country: "India" },
  { name: "Bhopal", region: "Madhya Pradesh", country: "India" },
  { name: "Bhubaneswar", region: "Odisha", country: "India" },
  { name: "Chandigarh", region: "Chandigarh", country: "India" },
  { name: "Chennai", region: "Tamil Nadu", country: "India", aliases: ["Madras"] },
  { name: "Coimbatore", region: "Tamil Nadu", country: "India" },
  { name: "Cuttack", region: "Odisha", country: "India" },
  { name: "Dehradun", region: "Uttarakhand", country: "India" },
  { name: "Delhi", region: "Delhi", country: "India" },
  { name: "Dhanbad", region: "Jharkhand", country: "India" },
  { name: "Durgapur", region: "West Bengal", country: "India" },
  { name: "Faridabad", region: "Haryana", country: "India" },
  { name: "Ghaziabad", region: "Uttar Pradesh", country: "India" },
  { name: "Gorakhpur", region: "Uttar Pradesh", country: "India" },
  { name: "Gurugram", region: "Haryana", country: "India", aliases: ["Gurgaon"] },
  { name: "Guwahati", region: "Assam", country: "India" },
  { name: "Gwalior", region: "Madhya Pradesh", country: "India" },
  { name: "Hyderabad", region: "Telangana", country: "India" },
  { name: "Indore", region: "Madhya Pradesh", country: "India" },
  { name: "Jabalpur", region: "Madhya Pradesh", country: "India" },
  { name: "Jaipur", region: "Rajasthan", country: "India" },
  { name: "Jalandhar", region: "Punjab", country: "India" },
  { name: "Jammu", region: "Jammu and Kashmir", country: "India" },
  { name: "Jamshedpur", region: "Jharkhand", country: "India" },
  { name: "Jodhpur", region: "Rajasthan", country: "India" },
  { name: "Kanpur", region: "Uttar Pradesh", country: "India" },
  { name: "Kochi", region: "Kerala", country: "India", aliases: ["Cochin"] },
  { name: "Kolhapur", region: "Maharashtra", country: "India" },
  { name: "Kolkata", region: "West Bengal", country: "India", aliases: ["Calcutta"] },
  { name: "Kozhikode", region: "Kerala", country: "India" },
  { name: "Lucknow", region: "Uttar Pradesh", country: "India" },
  { name: "Ludhiana", region: "Punjab", country: "India" },
  { name: "Madurai", region: "Tamil Nadu", country: "India" },
  { name: "Mangaluru", region: "Karnataka", country: "India", aliases: ["Mangalore"] },
  { name: "Meerut", region: "Uttar Pradesh", country: "India" },
  { name: "Mumbai", region: "Maharashtra", country: "India", aliases: ["Bombay"] },
  { name: "Mysuru", region: "Karnataka", country: "India", aliases: ["Mysore"] },
  { name: "Nagpur", region: "Maharashtra", country: "India" },
  { name: "Nashik", region: "Maharashtra", country: "India" },
  { name: "Noida", region: "Uttar Pradesh", country: "India" },
  { name: "Patna", region: "Bihar", country: "India" },
  { name: "Pimpri-Chinchwad", region: "Maharashtra", country: "India" },
  { name: "Puducherry", region: "Puducherry", country: "India", aliases: ["Pondicherry"] },
  { name: "Pune", region: "Maharashtra", country: "India" },
  { name: "Raipur", region: "Chhattisgarh", country: "India" },
  { name: "Rajkot", region: "Gujarat", country: "India" },
  { name: "Ranchi", region: "Jharkhand", country: "India" },
  { name: "Rourkela", region: "Odisha", country: "India" },
  { name: "Salem", region: "Tamil Nadu", country: "India" },
  { name: "Sangli", region: "Maharashtra", country: "India" },
  { name: "Siliguri", region: "West Bengal", country: "India" },
  { name: "Solapur", region: "Maharashtra", country: "India" },
  { name: "Srinagar", region: "Jammu and Kashmir", country: "India" },
  { name: "Surat", region: "Gujarat", country: "India" },
  { name: "Thane", region: "Maharashtra", country: "India" },
  { name: "Thiruvananthapuram", region: "Kerala", country: "India", aliases: ["Trivandrum"] },
  { name: "Thrissur", region: "Kerala", country: "India" },
  { name: "Tiruchirappalli", region: "Tamil Nadu", country: "India" },
  { name: "Tirunelveli", region: "Tamil Nadu", country: "India" },
  { name: "Udaipur", region: "Rajasthan", country: "India" },
  { name: "Vadodara", region: "Gujarat", country: "India", aliases: ["Baroda"] },
  { name: "Varanasi", region: "Uttar Pradesh", country: "India", aliases: ["Benares", "Kashi"] },
  { name: "Vijayawada", region: "Andhra Pradesh", country: "India" },
  { name: "Visakhapatnam", region: "Andhra Pradesh", country: "India" },
  { name: "Warangal", region: "Telangana", country: "India" },
  { name: "Remote — India", region: "Remote", country: "India" },
  { name: "Dubai", region: "Dubai", country: "United Arab Emirates" },
  { name: "Abu Dhabi", region: "Abu Dhabi", country: "United Arab Emirates" },
  { name: "Doha", region: "Doha", country: "Qatar" },
  { name: "Riyadh", region: "Riyadh", country: "Saudi Arabia" },
  { name: "Singapore", region: "Singapore", country: "Singapore" },
  { name: "Kuala Lumpur", region: "Kuala Lumpur", country: "Malaysia" },
  { name: "Bangkok", region: "Bangkok", country: "Thailand" },
  { name: "Jakarta", region: "Jakarta", country: "Indonesia" },
  { name: "Manila", region: "Metro Manila", country: "Philippines" },
  { name: "Ho Chi Minh City", region: "Ho Chi Minh", country: "Vietnam" },
  { name: "Colombo", region: "Western Province", country: "Sri Lanka" },
  { name: "Kathmandu", region: "Bagmati", country: "Nepal" },
  { name: "Dhaka", region: "Dhaka", country: "Bangladesh" },
  { name: "London", region: "England", country: "United Kingdom" },
  { name: "Manchester", region: "England", country: "United Kingdom" },
  { name: "Dublin", region: "Leinster", country: "Ireland" },
  { name: "Berlin", region: "Berlin", country: "Germany" },
  { name: "Amsterdam", region: "North Holland", country: "Netherlands" },
  { name: "Paris", region: "Île-de-France", country: "France" },
  { name: "Madrid", region: "Community of Madrid", country: "Spain" },
  { name: "Zurich", region: "Zurich", country: "Switzerland" },
  { name: "Stockholm", region: "Stockholm", country: "Sweden" },
  { name: "Warsaw", region: "Masovia", country: "Poland" },
  { name: "Toronto", region: "Ontario", country: "Canada" },
  { name: "Vancouver", region: "British Columbia", country: "Canada" },
  { name: "New York", region: "New York", country: "United States" },
  { name: "San Francisco", region: "California", country: "United States" },
  { name: "Seattle", region: "Washington", country: "United States" },
  { name: "Austin", region: "Texas", country: "United States" },
  { name: "Boston", region: "Massachusetts", country: "United States" },
  { name: "Chicago", region: "Illinois", country: "United States" },
  { name: "Sydney", region: "New South Wales", country: "Australia" },
  { name: "Melbourne", region: "Victoria", country: "Australia" },
  { name: "Auckland", region: "Auckland", country: "New Zealand" },
];

const POPULAR = [
  "Bengaluru",
  "Mumbai",
  "Delhi",
  "Hyderabad",
  "Pune",
  "Chennai",
  "Gurugram",
  "Noida",
];

export const locationsRouter = Router();
locationsRouter.use(requireAuth);

function label(place: Place): string {
  return `${place.name}, ${place.region}`;
}

// Ranked suggestions: exact prefix first, then word-start matches, then substring matches.
locationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const lowercase = q.toLowerCase();

    if (lowercase.length === 0) {
      res.json({
        locations: POPULAR.map((name) => PLACES.find((place) => place.name === name))
          .filter((place): place is Place => Boolean(place))
          .map((place) => ({ ...place, label: label(place) })),
      });
      return;
    }

    const scored = PLACES.map((place) => {
      const names = [place.name, ...(place.aliases ?? [])].map((value) => value.toLowerCase());
      let score = -1;
      for (const name of names) {
        if (name === lowercase) score = score >= 0 ? Math.min(score, 0) : 0;
        else if (name.startsWith(lowercase)) score = score >= 0 ? Math.min(score, 1) : 1;
        else if (name.split(/[\s-]/).some((word) => word.startsWith(lowercase))) {
          score = score >= 0 ? Math.min(score, 2) : 2;
        } else if (name.includes(lowercase)) {
          score = score >= 0 ? Math.min(score, 3) : 3;
        }
      }
      if (score < 0 && place.region.toLowerCase().includes(lowercase)) score = 4;
      return { place, score };
    })
      .filter((row) => row.score >= 0)
      .sort((a, b) => a.score - b.score || a.place.name.localeCompare(b.place.name))
      .slice(0, 8);

    res.json({
      locations: scored.map(({ place }) => ({ ...place, label: label(place) })),
    });
  }),
);

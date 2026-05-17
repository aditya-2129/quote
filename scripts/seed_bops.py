import sqlite3, uuid, time, sys

DB = r"C:\Users\aditya\AppData\Roaming\com.quote.app\quote.db"

ITEMS = [
    # (name, supplier, unit_cost)
    ("M6 x 20 socket head bolt",         "Unbrako",       7.50),
    ("M8 x 25 socket head bolt",         "Unbrako",      12.00),
    ("M10 x 30 socket head bolt",        "Unbrako",      18.50),
    ("M6 hex nut",                       "Unbrako",       2.20),
    ("M8 hex nut",                       "Unbrako",       3.80),
    ("M6 flat washer",                   "Generic",       0.75),
    ("M8 flat washer",                   "Generic",       1.20),
    ("Deep groove ball bearing 6204-2RS", "SKF",        185.00),
    ("Deep groove ball bearing 6205-2RS", "SKF",        225.00),
    ("Linear bearing LM12UU",            "THK",         320.00),
    ("Linear shaft 12mm x 500mm",        "Misumi",      540.00),
    ("Dowel pin 6 x 20",                 "Generic",      12.00),
    ("Retaining ring 25mm internal",     "Smalley",      18.00),
    ("O-ring 20mm ID NBR 70",            "Parker",        8.50),
    ("Oil seal 25x40x7",                 "NAK",          65.00),
    ("Hex key set 1.5-10 mm",            "Eklind",      480.00),
    ("Cable gland PG13.5",               "Lapp",         42.00),
    ("Power supply 24V 60W DIN rail",    "Mean Well",  1850.00),
    ("Limit switch roller lever",        "Omron",       720.00),
    ("Pneumatic cylinder ISO 32x100",    "SMC",        2850.00),
]

def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    inserted, skipped = 0, 0
    for name, supplier, unit_cost in ITEMS:
        # Skip if a catalog row already exists with the same name.
        existing = cur.execute(
            "SELECT id FROM bop_catalog WHERE name = ?",
            (name,),
        ).fetchone()
        if existing:
            skipped += 1
            continue
        cur.execute(
            "INSERT INTO bop_catalog (id, name, supplier, unit_cost, currency) "
            "VALUES (?, ?, ?, ?, 'INR')",
            (str(uuid.uuid4()), name, supplier, unit_cost),
        )
        inserted += 1
    con.commit()
    total = cur.execute("SELECT COUNT(*) FROM bop_catalog").fetchone()[0]
    print(f"Inserted: {inserted}, Skipped (already present): {skipped}, Total rows now: {total}")
    con.close()

if __name__ == "__main__":
    main()

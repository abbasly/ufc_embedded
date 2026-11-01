import pandas as pd

from ufc_embedded.champions import current_champions, current_ranks


def test_champions_and_ranks_match_fighters_by_name() -> None:
    profiles = pd.DataFrame(
        {"name": ["Natália Silva", "Ciryl Gane", "Tom Aspinall"]}, index=["ns", "cg", "ta"]
    )
    rankings = pd.DataFrame(
        {
            "division": ["Heavyweight", "Heavyweight", "Women's Flyweight", "Middleweight"],
            "name": ["Ciryl Gane", "Tom Aspinall", "Natalia Silva", "Unknown Person"],
            "rank": [0, 1, 0, 0],
        }
    )
    assert current_champions(rankings, profiles) == [
        {"division": "Heavyweight", "name": "Ciryl Gane", "fighter": "cg"},
        {"division": "Women's Flyweight", "name": "Natalia Silva", "fighter": "ns"},  # accents
        {"division": "Middleweight", "name": "Unknown Person", "fighter": None},
    ]
    assert current_ranks(rankings, profiles) == {"cg": 0, "ta": 1, "ns": 0}

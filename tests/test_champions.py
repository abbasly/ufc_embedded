from ufc_embedded.champions import parse_champions

WIKITEXT = """==Current champions==
===Men===
{| class="wikitable sortable"
! width=120| Division !!width=200| Champion !!width=75| Since !!width=45| Defenses
|-
! style="text-align:left;"| [[#Heavyweight Championship|Heavyweight]]
| {{flagicon|FRA}} [[Ciryl Gane]]
| Sep 14, 2026
| style="text-align:center;" | 0
|-
! style="text-align:left;"| [[List of UFC champions#Middleweight Championship|Middleweight]]
| {{flagicon|USA}} [[Sean Strickland]]
| May 9, 2026
| align=center| 0
|}

===Women===
{| class="wikitable sortable"
|-
! style="text-align:left;"| [[#Women's Flyweight Championship|Flyweight]]
| {{flagicon|BRA}} [[Natália Silva (fighter)|Natália Silva]]
| Oct 3, 2026
| align=center| 0
|}
"""


def test_parse_champions_handles_piped_links_and_women_prefix() -> None:
    assert parse_champions(WIKITEXT) == [
        ("Heavyweight", "Ciryl Gane", "Sep 14, 2026", "Ciryl Gane"),
        ("Middleweight", "Sean Strickland", "May 9, 2026", "Sean Strickland"),
        ("Women's Flyweight", "Natália Silva", "Oct 3, 2026", "Natália Silva (fighter)"),
    ]

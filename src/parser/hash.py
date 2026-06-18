def fnv1a(text: str) -> str:
    h = 0x811C9DC5
    for ch in text:
        h ^= ord(ch) & 0xFFFF
        h = (h * 0x01000193) & 0xFFFFFFFF
    return 'orion_' + format(h, '08x')

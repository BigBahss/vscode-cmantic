// Used to test 'cmantic.createMatchingSourceFile'

#ifndef SOME_HEADER_H
#define SOME_HEADER_H

#include "derived.h"


class SomeObject
{
public:
    SomeObject(int some_int);
    ~SomeObject();

    Derived derived() const;
    void setDerived(const Derived &derived);

private:
    Derived m_derived;
};

#endif // SOME_HEADER_H
